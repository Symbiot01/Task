const router = require('express').Router();
const fs = require('fs').promises;
const path = require('path');

router.get('/:target?', (req, res) => {
	const months = [
		'-',
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	return fs.readdir(path.join(__dirname, '../templates/newsletters')).then(letters => {
		const years = {};
		letters.sort();
		letters.forEach(letter => {
			const [year, month, num] = letter.split('-');
			if (!years[year]) years[year] = { title: year, months: {} };
			if (!years[year].months[~~month]) years[year].months[~~month] = { title: months[~~month], issues: [] };
			years[year].months[~~month].issues.push({
				title: ['-', 'First', 'Second', 'Special'][~~num],
				href: letter
			});
		});
		const renderYears = Object.values(years);
		renderYears.forEach(year => year.months = Object.values(year.months).reverse());

		const target = req.params.target;
		if (!target) return res.renderFile('newsletters.njk', {
			years: renderYears.reverse()
		});
		if (target === 'random') {
			const referer = req.headers.referer?.split('/').pop();
			const randLetter = letters.filter(letter => letter !== referer).random();
			return res.redirect(`/newsletters/${randLetter}`);
		}
		const index = letters.indexOf(target);
		if (index === -1) return res.notFound('newsletters_404.njk', { years: renderYears.reverse() });
		const filepath = ['newsletters', letters[index], letters[index] + '.njk'];
		const adjs = [letters[index - 1], letters[index + 1], letters[index]];
		fs.readdir(path.join(__dirname, '../templates/newsletters', target)).then(files => {
			const pages = files.filter(file => file.includes('#'));
			return res.renderFile(filepath, { adjs, pages, target });
		});

	}).catch(err => {
		console.log(err);
		return res.notFound();
	});
});

module.exports = {
	route: '/newsletters',
	router
};
