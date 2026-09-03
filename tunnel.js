const localtunnel = require('localtunnel');

(async () => {
  async function startTunnel() {
    try {
      const tunnel = await localtunnel({ port: 3001 });
      console.log(`your url is: ${tunnel.url}`);

      tunnel.on('close', () => {
        console.log('Tunnel closed. Restarting in 2 seconds...');
        setTimeout(startTunnel, 2000);
      });
      
      tunnel.on('error', (err) => {
        console.error('Tunnel error:', err);
      });
    } catch (err) {
      console.error('Failed to start tunnel:', err);
      setTimeout(startTunnel, 2000);
    }
  }

  startTunnel();
})();
