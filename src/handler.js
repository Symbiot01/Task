const fs = require('fs').promises;
const path = require('path');

function nth (num) {
	const lastDigit = num % 10;
	switch (lastDigit) {
		case 1: return num + 'st';
		case 2: return num + 'nd';
		case 3: return num + 'rd';
		default: return num + 'th';
	}
}

function xmur3 (str) {
	for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = h << 13 | h >>> 19;
	} return function() {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (h ^= h >>> 16) >>> 0;
	};
}

function fakeRandom (seed) {
	let a = xmur3(seed)();
	return function () {
		let t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

require('./login.js');

function handler (app, env, vapid) {

	// Pre-routing
	app.get('/login/federated/google', passport.authenticate('google'));
	app.get('/oauth2/redirect/google', passport.authenticate('google', {
		successReturnToOrRedirect: '/',
		failureRedirect: '/login'
	}));

	function get (req, res) {
		function notFound (custom404, ctx) {
			res.status(404).render(path.join(__dirname, '../templates', custom404 || '404.njk'), ctx);
		}
		function tryFile (path, asset, ctx) {
			fs.access(path).then(err => {
				if (err) notFound(false, ctx);
				else res[asset ? 'sendFile' : 'render'](path, ctx);
			}).catch(() => {
				notFound(false, ctx);
			});
		}
		const GET = req.url.match(/(?<=\?)[^/]+$/);
		if (GET) req.url = req.url.slice(0, -(GET[0].length + 1));
		const args = req.url.split('/');
		args.shift();
		switch (args[0]) {
			case '': case 'home': {
				const posts = require('./posts.json').slice(0, 7);
				posts.forEach(post => {
					const elapsed = Date.now() - Date.parse(post.date.replace(/(?<=^\d{1,2})[a-z]{2}/, '').replace(/,/, ''));
					if (!isNaN(elapsed) && elapsed < 7 * 24 * 60 * 60 * 1000) post.recent = true;
				});
				const vids = require('./posts.json').filter(post => {
					return post.type === 'video' && post.hype && post.link.includes('www.youtube.com');
				}).shuffle().slice(0, 5);
				const art = require('./posts.json').filter(post => post.type === 'art' && post.hype).slice(0, 5);
				res.render(path.join(__dirname, '../templates', 'home.njk'), { posts, vids, art });
				break;
			}
			case 'art': {
				const art = require('./posts.json').filter(post => post.type === 'art');
				res.render(path.join(__dirname, '../templates', 'art.njk'), { art });
				break;
			}
			case 'assets': {
				args.shift();
				const filepath = path.join(__dirname, '../assets', ...args);
				fs.access(filepath).then(err => {
					if (err) notFound();
					else res.sendFile(filepath);
				}).catch(() => notFound());
				break;
			}
			case 'login': {
				/*if (args[1] === 'federated' && args[2] === 'google' && !args[3]) {
					console.log(req, req.user);
					passport.authenticate('google');
				}*/
				res.render(path.join(__dirname, '../templates', 'login.njk'));
				break;
			}
			case 'logout': {
				req.logout();
				res.redirect('/');
				break;
			}
			case 'members': {
				const members = require('./members.json');
				const ctx = {
					'Governors': [],
					'5th': [],
					'4th': [],
					'3rd': [],
					'2nd': [],
					'1st': [],
					'Former Governors': [],
					'Alumni': []
				};
				members.forEach(member => {
					ctx[member.gov || ['0th', '1st', '2nd', '3rd', '4th', '5th'][member.year]].push({
						name: member.name,
						roll: member.roll,
						href: `${member.name.toLowerCase().replace(/[\.-]/g, '').replace(/ /g, '_')}.webp`,
						teams: [{
							name: 'AMV',
							icon: 'amv'
						}, {
							name: 'Design & Arts',
							icon: 'design'
						}, {
							name: 'Music',
							icon: 'music'
						}, {
							name: 'Quiz',
							icon: 'quiz'
						}, {
							name: 'WebDev',
							icon: 'webdev'
						}].filter((_, index) => member.teams[index])
					});
				});
				tryFile(path.join(__dirname, '../templates', 'members.njk'), false, { members: ctx });
				break;
			}
			case 'newsletters': {
				const months = [
					'-', 'January', 'February', 'March', 'April', 'May', 'June',
					'July', 'August', 'September', 'October', 'November', 'December'
				];
				fs.readdir(path.join(__dirname, '../templates/newsletters')).then(letters => {
					const years = {};
					letters.sort();
					letters.forEach(letter => {
						const [year, month, num] = letter.slice(0, -4).split('-');
						if (!years[year]) years[year] = { title: year, months: {} };
						if (!years[year].months[~~month]) years[year].months[~~month] = { title: months[~~month], issues: [] };
						years[year].months[~~month].issues.push({
							title: ['-', 'First', 'Second', 'Special'][~~num],
							href: letter.slice(0, -4)
						});
					});
					const renderYears = Object.values(years);
					renderYears.forEach(year => year.months = Object.values(year.months).reverse());
					if (!args[1]) return res.render(path.join(__dirname, '../templates', 'newsletters.njk'), {
						years: renderYears.reverse()
					});
					if (args[1] === 'random') {
						const referer = req.headers.referer?.split('/').pop();
						const randLetter = letters.filter(letter => letter.slice(0, -4) !== referer).random().slice(0, -4);
						return res.redirect(`/newsletters/${randLetter}`);
					}
					const index = letters.indexOf(args[1] + '.njk');
					if (index === -1) return notFound('newsletters_404.njk', { years: renderYears.reverse() });
					const filepath = path.join(__dirname, '../templates', 'newsletters', letters[index]);
					const adjs = [letters[index - 1]?.slice(0, -4), letters[index + 1]?.slice(0, -4), letters[index].slice(0, -4)];
					return res.render(filepath, { adjs });
				}).catch(err => console.log(err) || notFound());
				break;
			}
			case 'quizzes': case 'events': {
				const QUIZZES = require('./quiz.json');
				const months = [
					'-', 'January', 'February', 'March', 'April', 'May', 'June',
					'July', 'August', 'September', 'October', 'November', 'December'
				];
				fs.readdir(path.join(__dirname, '../templates/quizzes')).then(quizzes => {
					const years = {};
					quizzes.sort();
					quizzes.forEach(quiz => {
						const [year, month, date] = quiz.slice(0, -4).split('-');
						if (!years[year]) years[year] = { title: year, months: {} };
						if (!years[year].months[~~month]) years[year].months[~~month] = { title: months[~~month], issues: [] };
						years[year].months[~~month].issues.push({
							title: `${nth(~~date)} ${months[~~month]}`,
							href: quiz.slice(0, -4)
						});
					});
					const renderYears = Object.values(years);
					renderYears.forEach(year => year.months = Object.values(year.months).reverse());
					if (!args[1]) {
						const LOGGED_IN = true;
						if (!LOGGED_IN) return res.render(__dirname, '../templates', 'quiz_login.njk');
						return res.render(path.join(__dirname, '../templates', 'events.njk'), {
							years: renderYears.reverse()
						});
					}
					const index = quizzes.indexOf(args[1] + '.njk');
					if (index === -1) return notFound('quizzes_404.njk', { years: renderYears.reverse() });
					const filepath = path.join(__dirname, '../templates', 'quizzes', quizzes[index]);
					const adjs = [quizzes[index - 1]?.slice(0, -5), quizzes[index + 1]?.slice(0, -5), quizzes[index].slice(0, -5)];
					const QUIZ = QUIZZES[args[1]];
					const rand = fakeRandom("TOKEN_GOES_HERE");
					function shuffle (array) {
						for (let i = array.length - 1; i > 0; i--) {
							let j = Math.floor(rand() * (i + 1));
							[array[i], array[j]] = [array[j], array[i]];
						}
						return array;
					}
					const questions = [];
					QUIZ.random.forEach(randDef => {
						const keys = shuffle(Object.keys(randDef.from)).slice(0, randDef.amount);
						questions.push(...keys.map(key => randDef.from[key]).map(key => {
							const q = JSON.parse(JSON.stringify(QUIZ.questions[key]));
							delete q.solution;
							return q;
						}));
					});
					shuffle(questions);
					return res.render(filepath, { adjs, questions: JSON.stringify(questions) });
				}).catch(err => console.log(err) || notFound());
				break;
			}
			case 'rebuild': {
				env.loaders.forEach(loader => loader.cache = {});
				['./members.json', './posts.json'].forEach(cache => delete require.cache[require.resolve(cache)]);
				res.render(path.join(__dirname, '../templates', 'rebuild.njk'));
				break;
			}
			case 'videos': {
				const vids = require('./posts.json');
				const youtubeVids = vids.filter(vid => vid.link.includes('www.youtube.com'));
				const instaVids = vids.filter(vid => vid.link.includes('www.instagram.com'));
				res.render(path.join(__dirname, '../templates', 'videos.njk'), { youtubeVids, instaVids });
				break;
			}
			default: {
				while (!args[args.length - 1]) args.pop();
				const isAsset = /\.(?:js|ico)$/.test(args[args.length - 1]);
				const filepath = path.join(
					__dirname,
					isAsset ? '../assets' : '../templates', path.join(...args) + (isAsset ? '' : '.njk')
				);
				tryFile(filepath, isAsset);
				
			}
		}
	}
	function post (req, res) {
		const args = req.url.split('/');
		args.shift();

		switch (args[0]) {
			case "checker": {
				const checker = require('./checker.js');
				const correct = checker.compare(args[2], args[1], req.body); //req.data
				switch (correct) {
					case true: {
						return res.send("correct");
						break;
					}
					case false: {
						return res.send("");
						break;
					}
					default: {
						return res.send(correct);
						break;
					}
				}
				break;
			}
			default:
				res.redirect(`/${args.join('/')}`);
				break;
		}
	}

	app.get(/.*/, (req, res) => get(req, res));
	app.post(/.*/, (req, res) => post(req, res));

	// VAPID will be required for push notifications
}

module.exports = handler;