import { Request, Response, Router } from "express";
import YAML from 'yaml';
import fs from 'fs';
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';

const str = fs.readFileSync('./setting.yaml');
const setting = YAML.parse(str.toString());

const baseRouting = (router: Router) => {
};

const routing = (router: Router) => {
	router.all('*', async (req: Request, res: Response) => {
		const time = new Date().toISOString();
		const signature = createSignature(req.method, time, req.baseUrl, req.query);
		const headers: {[key: string]: string} = {
			[setting.ncmb.headers.applicationKey]: setting.ncmb.applicationKey,
			[setting.ncmb.headers.timestamp]: time,
			[setting.ncmb.headers.signature]: signature,
		};
		if (req.headers["content-type"] === "application/json") {
			headers["Content-Type"] = "application/json";
		}
		if (req.headers[setting.ncmb.headers.session]) {
			headers[setting.ncmb.headers.session] = req.headers[setting.ncmb.headers.session] as string;
		}
		try {
			const { data } = await axios({
				url: `https://${setting.ncmb.domain}${req.baseUrl}`,
				method: req.method,
				headers: headers,
				params: req.query,
				data: req.body,
			});
			res.json(data);
		} catch (e) {
			const err = e as AxiosError;
			err.response && res.status(err.response.status).json(err.response.data);
		}
	});
	return router;
};

const createSignature = (method: string, time: string, path: string, q:{ [s: string]: any } = {}): string => {
	const queries = {...q}
	const { signature, headers } = setting.ncmb;
	queries[signature.method.name] = signature.method.value;
	queries[signature.version.name] = signature.version.value;
	queries[headers.applicationKey] = setting.ncmb.applicationKey;
	queries[headers.timestamp] = time
	const query = Object.keys(queries).sort().map(k => {
		const val = typeof queries[k] === 'object' ? JSON.stringify(queries[k]) : queries[k]
		return `${k}=${encodeURI(val)}`
	}).join('&')
	const str = [method, setting.ncmb.domain, path, query].join("\n")
	const hmac = crypto.createHmac('sha256', setting.ncmb.clientKey);
  return hmac.update(str).digest('base64');
}

export { routing };