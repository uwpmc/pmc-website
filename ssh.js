var SSH = require('simple-ssh');

var ssh = new SSH({
      host: 'localhost',
      user: 'username',
      pass: 'password'
});

ssh.exec('echo $PATH', {
      out: function(stdout) {
                console.log(stdout);
            }
}).start();

/*** Using the `args` options instead ***/
ssh.exec('echo', {
      args: ['$PATH'],
      out: function(stdout) {
                console.log(stdout);
            }
}).start();
