const router = require('express').Router();

const checker = require('../src/checker.js');
const dbh = PARAMS.mongoless ? {} : require('../database/handler');

const handlerContext = {}; // Store cross-request context here

router.get('/', async (req, res) => {
	if (!req.loggedIn) {
		if (!PARAMS.userless) req.session.returnTo = req.url;
		return res.renderFile('events/quiz_login.njk');
	}
	const quiz = await dbh.getLiveQuiz(PARAMS.dev ? '2022-11-12' : false);
	if (!quiz) return res.renderFile('events/quizzes_404.njk', { message: `The quiz hasn't started, yet!` });
	const QUIZ = quiz.questions;
	const user = await dbh.getUser(req.user._id);
	if (user.permissions?.includes('quizmaster')) {
		return res.renderFile('events/live_master.njk', {
			quiz: JSON.stringify(QUIZ),
			qAmt: QUIZ.length,
			id: 'live'
		});
	} else {
		return res.renderFile('events/live_participant.njk', {
			id: 'live',
			userId: req.user._id
		});
	}
});

router.get('/master', async (req, res) => {
	if (PARAMS.dev) {
		// TODO: In the future, set a 'daily' script to run at midnight and update a process.env.LIVE_QUIZ parameter
		const quiz = await dbh.getLiveQuiz('2022-11-12');
		console.log("Hello");
		// if (!quiz) return res.renderFile('events/quizzes_404.njk', { message: `The quiz hasn't started, yet!` });
		const QUIZ = quiz.questions;

		return res.renderFile('events/live_master.njk', {
			quiz: JSON.stringify(QUIZ),
			qAmt: QUIZ.length,
			id: 'live',
			dev: PARAMS.dev
		});
	} else {
		return res.renderFile('events/quizzes_404.njk', { message: `STOP SNOOPING AROUND!` });
	}
});

router.get('/results', async (req, res) => {
	const quizId = new Date().toISOString().slice(0, 10);
	const RES = await dbh.getAllLiveResults(quizId);
	if (!RES) return res.notFound();
	const results = [];
	RES.forEach(_RES => {
		if (!results.find(res => res.id === _RES.userId)) {
			results.push({
				id: _RES.userId,
				name: _RES.username,
				points: 0
			});
		}
		results.find(res => res.id === _RES.userId).points += _RES.points;
	});
	results.sort((a, b) => -(a.points > b.points));
	let i = 1, j = 1;
	for (let result = 0; result < results.length; result++) {
		if (!result) results[result].rank = i;
		else {
			if (results[result].points === results[result - 1].points) j++;
			else {
				i += j;
				j = 1;
			}
			results[result].rank = i;
		}
		delete results[result].id;
	}
	return res.renderFile('events/results.njk', { results });
});

router.post('/', async (req, res) => {
	if (!req.loggedIn) {
		if (!PARAMS.userless) req.session.returnTo = req.url;
		return res.renderFile('events/quiz_login.njk');
	}
	if (!handlerContext.liveQuiz) handlerContext.liveQuiz = {};
	const LQ = handlerContext.liveQuiz;
	const quiz = await dbh.getLiveQuiz(PARAMS.dev ? '2022-11-12' : false);
	const QUIZ = quiz.questions;
	const user = await dbh.getUser(req.user._id);
	if (user.permissions?.includes('quizmaster')) {
		const { currentQ, options } = req.body;
		const time = { '10': 20, '5': 15, '3': 12 }[QUIZ[currentQ].points];
		io.sockets.in('waiting-for-live-quiz').emit('question', { currentQ, options, time });
		setTimeout(() => {
			const type = QUIZ[currentQ].options.type;
			const solution = QUIZ[currentQ].solution;
			setTimeout(() => io.sockets.in('waiting-for-live-quiz').emit('answer', {
				answer: Array.isArray(solution) ? solution.join(' / ') : solution,
				type
			}), 2000); // Emit the actual event 3s after
		}, 1000 * (time + 1)); // Extra second to account for lag
		LQ.currentQ = req.body.currentQ;
		LQ.endTime = Date.now() + 1000 * (time + 1);
		res.send('Done');
	} else {
		const answer = req.body.submittedAnswer;
		if (answer === '') return res.error('Missing answer');
		const currentQ = LQ.currentQ ?? - 1;
		const Q = QUIZ[currentQ];
		if (!Q) return res.error('currentQ out of bounds');
		const time = Math.round((LQ.endTime - Date.now()) / 1000);
		if (time < 0) return res.error('Too late!');
		const alreadySubmitted = await dbh.getLiveResult(user._id, quiz.title, currentQ);
		if (alreadySubmitted) return res.error('Already attempted this question!');
		const { points, timeLeft } = await checker.checkLiveQuiz(answer, Q.solution, Q.options.type, Q.points, time);
		const result = points
			? points < Q.points ? 'partial' : 'correct'
			: 'incorrect';
		const functionArgs = [user._id, quiz.title, currentQ, points, answer, timeLeft, result];
		dbh.addLiveResult(...functionArgs).then(() => res.send('Submitted')).catch(e => console.log(e) && res.error(e));
	}
});

router.post('/master', async (req, res) => {
	if (PARAMS.dev) {
		// LQ keeps track of which question is currently being asked
		if (!handlerContext.liveQuiz) handlerContext.liveQuiz = {};
		const LQ = handlerContext.liveQuiz;
		const quiz = await dbh.getLiveQuiz('2022-11-12');
		const QUIZ = quiz.questions;
		// console.log(req.body);
		const { currentQ, options } = req.body;

		const time = { '10': 20, '5': 15, '3': 12 }[QUIZ[currentQ].points];
		io.sockets.in('waiting-for-live-quiz').emit('question', { currentQ, options, time });
		setTimeout(() => {
			const type = QUIZ[currentQ].options.type;
			const solution = QUIZ[currentQ].solution;
			setTimeout(() => io.sockets.in('waiting-for-live-quiz').emit('answer', {
				answer: Array.isArray(solution) ? solution.join(' / ') : solution,
				type
			}), 2000); // Emit the actual event 3s after
		}, 1000 * (time + 1)); // Extra second to account for lag
		LQ.currentQ = req.body.currentQ;
		LQ.endTime = Date.now() + 1000 * (time + 1);
		res.send('Done');
	} else {
		return res.renderFile('events/quizzes_404.njk', { message: `STOP SNOOPING AROUND!` });
	}
});

router.post('/end', async (req, res) => {
	if (!req.loggedIn) {
		if (!PARAMS.userless) req.session.returnTo = req.url;
		return res.renderFile('events/quiz_login.njk');
	}
	const user = await dbh.getUser(req.user._id);
	if (!user.permissions.find(perm => perm === 'quizmaster')) throw new Error('Access denied');
	io.sockets.in('waiting-for-live-quiz').emit('end-quiz');
	return res.send('Ended!');
});

module.exports = {
	route: '/live',
	router
};
