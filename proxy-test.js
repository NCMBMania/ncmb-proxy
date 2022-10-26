const NCMB = require('ncmb');
const fs = require('fs');
const axios = require('axios');

const ncmb = new NCMB("9170ffcb91da1bbe0eff808a967e12ce081ae9e3262ad3e5c3cac0d9e54ad941", "9e5014cd2d76a73b4596deffdc6ec4028cfc1373529325f8e71b7a6ed553157d", {
	fqdn: "localhost",
	scriptFqdn: "localhost",
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
	await test
		.set('msg', 'Hello, again')
		.update();
	await test.delete();
	const res2 = await Test
		.limit(10)
		.fetchAll();
	console.log(res2);
	/*
	const test2 = new Test;
	await test2.set('objectId', 'bIJYu1y1kBrEthK6')
		.set('msg', 'Helllllo')
		.update();
	await test2.delete();	
	*/
	const r = await ncmb.Role
		.equalTo('roleName', 'test')
		.fetch();
	if (Object.keys(r).length > 0) {
		await r.delete();
	}
	return;
	const role = new ncmb.Role('test');
	await role.save();
	const user = new ncmb.User;
	await user.set('userName', 'test').set('password', 'test').signUpByAccount();
	const u = await ncmb.User.login('test', 'test');
	await u.delete();

	const data = fs.readFileSync('./test.jpg');
	await ncmb.File.upload('test.jpg', data);
	const buffer = await ncmb.File.download('test.jpg', 'blob');
	fs.writeFileSync('./test2.jpg', buffer);
})();

(async () => {
	const buffer = await ncmb.File.download('test.jpg', 'blob');
	fs.writeFileSync('./test2.jpg', buffer);
});

(async () => {
	console.log(await ncmb.Script
		.query({name: 'test'})
    .exec("GET", "script_test_get.js"));
	console.log(await ncmb.Script
		.data({"name": "test"}) 
		.exec("POST", "script_test_post.js"));
	console.log(await ncmb.Script
		.data({"name": "test2"}) 
		.exec("PUT", "script_test_put.js"));
	console.log(await ncmb.Script
		.query({name: 'test'})
		.exec("DELETE", "script_test_delete.js"));
});

(async () => {
	const res = await axios.get('http://127.0.0.1:3000/script/script_test_get.js');
	console.log(res.data);
});