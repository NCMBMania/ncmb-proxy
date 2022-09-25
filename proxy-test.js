const NCMB = require('ncmb');
const ncmb = new NCMB("9170ffcb91da1bbe0eff808a967e12ce081ae9e3262ad3e5c3cac0d9e54ad941", "9e5014cd2d76a73b4596deffdc6ec4028cfc1373529325f8e71b7a6ed553157d", {
	fqdn: "localhost",
	protocol: "http",
	port: 3000
});
const Test = ncmb.DataStore("Test");

(async () => {
	const res = await Test
		.limit(10)
		.equalTo('objectId', 'test')
		.fetchAll();
	console.log(res);
	const test = new Test;
	await test
		.set('msg', 'Hello, NCMB!')
		.save();
	const res2 = await Test
		.limit(10)
		.fetchAll();
	console.log(res2);
	
	const r = await ncmb.Role
		.equalTo('roleName', 'test')
		.fetch();
	await r.delete();
	const role = new ncmb.Role('test');
	await role.save();
	const user = new ncmb.User;
	await user.set('userName', 'test').set('password', 'test').signUpByAccount();
	const u = await ncmb.User.login('test', 'test');
	await u.delete();
})()

