const http = require('http');

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/v1/proxy/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Headers:', res.headers);
      console.log('Body:', body);
    });
  }
);
req.write(JSON.stringify({ username: 'admin' }));
req.end();
