const express = require('express');
const app = express();
app.use((req, res, next) => {
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', () => {
    console.log('--- Incoming Request ---');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', body);
    res.status(200).send('OK');
  });
});
app.listen(4001, () => console.log('Listening on 4001'));
