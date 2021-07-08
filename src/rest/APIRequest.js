'use strict';

const FormData = require('@discordjs/form-data');
const AbortController = require('abort-controller');
const fetch = require('petitio');
const Client = require('undici/lib/core/client.js');
const { UserAgent } = require('../util/Constants');

const client = new Client('https://discord.com', { pipelining: 10, keepAliveTimeout: 300000 });

class APIRequest {
  constructor(rest, method, path, options) {
    this.rest = rest;
    this.client = rest.client;
    this.method = method;
    this.route = options.route;
    this.options = options;
    this.retries = 0;

    let queryString = '';
    if (options.query) {
      const query = Object.entries(options.query)
        .filter(([, value]) => value !== null && typeof value !== 'undefined')
        .flatMap(([key, value]) => (Array.isArray(value) ? value.map(v => [key, v]) : [[key, value]]));
      queryString = new URLSearchParams(query).toString();
    }
    this.path = `${path}${queryString && `?${queryString}`}`;
  }

  make() {
    const baseURL = this.retries ? 'https://discord.com/api' : this.client.options.http.api;
    const API = this.options.versioned === false ? baseURL : `${baseURL}/v${this.client.options.http.version}`;
    const url = API + this.path;
    let headers = {};

    if (this.options.auth !== false) headers.Authorization = this.rest.getAuth();
    if (this.options.reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(this.options.reason);
    headers['User-Agent'] = UserAgent;
    if (this.options.headers) headers = Object.assign(headers, this.options.headers);

    let body;
    if (this.options.files?.length) {
      body = new FormData();
      for (var i = 0; i !== this.options.files.length; ++i) {
        const file = this.options.files[i];
        if (file && file.file) body.append(file.name, file.file, file.name);
      }
      if (this.options.data) {
        body.append('payload_json', JSON.stringify(this.options.data));
      }
      Object.assign(headers, body.getHeaders());
    } else if (this.options.data) {
      body = JSON.stringify(this.options.data);
      headers['Content-Type'] = 'application/json';
    }
    const controller = new AbortController();
    const timeout = this.client.setTimeout(() => controller.abort(), this.client.options.restRequestTimeout);

    const req = fetch(url, this.method.toUpperCase()).client(client, true);

    if (body) req.body(body instanceof FormData ? body.getBuffer() : body);

    return req
      .header(headers)
      .send()
      .finally(() => this.client.clearTimeout(timeout));
  }
}

module.exports = APIRequest;
