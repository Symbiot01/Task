const router = require('express').Router();
// Back-end code
router.get('/login', async (req, res) => {
	return res.renderFile('forms/login.njk');
	
router.get('/register', async (req, res) => {
	return res.renderFile('forms/register.njk');
	
router.get('/logged-in', async (req, res) => {
	return res.renderFile('forms/loggged-in.njk');
	
router.get('/logged-out', async (req, res) => {
	return res.renderFile('forms/logged-out.njk');
});
module.exports = {
	route: '/forms',
	router
};
