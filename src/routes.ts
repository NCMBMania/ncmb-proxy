import { Request, Response, Router } from "express";
import YAML from 'yaml';
import fs from 'fs';
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import multer from "multer";

const str = fs.readFileSync('./setting.yaml');
const setting = YAML.parse(str.toString());

const routing = (router: Router) => {
	router.all('*', async (req: Request, res: Response) => {
		const time = new Date().toISOString();
		const domain = req.baseUrl.indexOf(setting.ncmb.version) === 1 ? setting.ncmb.domain : setting.ncmb.script.domain;
		const signature = createSignature(req.method, domain, time, req.baseUrl, req.query);
		const headers: {[key: string]: string} = {
			[setting.ncmb.headers.applicationKey]: setting.ncmb.applicationKey,
			[setting.ncmb.headers.timestamp]: time,
			[setting.ncmb.headers.signature]: signature,
		};
		headers["Content-Type"] = req.headers["content-type"]!;
		if (req.headers[setting.ncmb.headers.session]) {
			headers[setting.ncmb.headers.session] = req.headers[setting.ncmb.headers.session] as string;
		}
		try {
			// ファイルストアへのGETリクエストであれば、レスポンスはArrayBufferで返す
			const reg = new RegExp(`^/${setting.ncmb.version}/files/`);
			const responseType = req.method.toUpperCase() == 'GET' && reg.test(req.baseUrl) ? 'arraybuffer' : 'json';
			const response = await axios({
				url: `https://${domain}${req.baseUrl}`,
				method: req.method,
				headers: headers,
				params: req.query,
				data: req.body,
				responseType,
			});
			// レスポンスのヘッダーで判別
			const contentType = response.headers["content-type"];
			if (contentType === 'application/json') {
				// JSONであればそのまま
				res.json(response.data);
			} else {
				// Arraybufferの場合は、レスポンスヘッダーを設定して、そのまま返す
				res.setHeader('content-type', contentType);
				res.send(response.data);
			}
		} catch (e) {
			const err = e as AxiosError;
			err.response && res.status(err.response.status).json(err.response.data);
		}
	});
	return router;
};

const createSignature = (method: string, domain: string, time: string, path: string, q:{ [s: string]: any } = {}): string => {
	const queries = (domain === setting.ncmb.domain) ? {...q} : {};
	const { signature, headers } = setting.ncmb;
	queries[signature.method.name] = signature.method.value;
	queries[signature.version.name] = signature.version.value;
	queries[headers.applicationKey] = setting.ncmb.applicationKey;
	queries[headers.timestamp] = time
	const query = Object.keys(queries).sort().map(k => {
		const val = typeof queries[k] === 'object' ? JSON.stringify(queries[k]) : queries[k]
		return `${k}=${encodeURI(val)}`
	}).join('&');
	const str = [
		method,
		domain,
		path,
		query
	].join("\n");
	const hmac = crypto.createHmac('sha256', setting.ncmb.clientKey);
  return hmac.update(str).digest('base64');
}

export { routing };