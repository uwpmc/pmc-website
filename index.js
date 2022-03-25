const express = require('express')
const app = express()
const port = 80

const path = require('path')
const fs = require('fs')
var bodyParser = require('body-parser')
var showdown  = require('showdown')

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

const mysql = require('mysql')
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1q2w3e!Q@W#Ebulcmp',
  database: 'pmc'
})


/* OAUTH WORK */

const session = require('express-session')
const passport = require('passport')

const GoogleStrategy = require( 'passport-google-oauth2' ).Strategy;

//Middleware
app.use(session({
    secret: "secret",
    resave: false ,
    saveUninitialized: true ,
}))

app.use(passport.initialize()) // init passport on every route call
app.use(passport.session())    //allow passport to use "express-session"

const GOOGLE_CLIENT_ID =
"407152582406-ad0u942n6550ctlh4852hm26qss44t4r.apps.googleusercontent.com"
const GOOGLE_CLIENT_SECRET="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"

authUser = (request, accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }

passport.use(new GoogleStrategy({
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost/auth/google/callback",
    passReqToCallback   : true
  }, authUser));

passport.serializeUser( (user, done) => {
   done(null, user)
})

passport.deserializeUser((user, done) => {
  done (null, user)
})

//Middleware to see how the params are populated by Passport
let count = 1
showlogs = (req, res, next) => {
    console.log("\n==============================")
    console.log(`------------>  ${count++}`)

    console.log(`\n req.session.passport -------> `)
    console.log(req.session.passport)

    console.log(`\n req.user -------> `)
    console.log(req.user)

    console.log("\n Session and Cookie")
    console.log(`req.session.id -------> ${req.session.id}`)
    console.log(`req.session.cookie -------> `)
    console.log(req.session.cookie)

    console.log("===========================================\n")

    next()
}

//app.use(showlogs) //user printData function as middleware to print populated variables

app.get('/auth/google',
  passport.authenticate('google', { scope:
      [ 'email', 'profile' ] }
));

app.get('/auth/google/callback',
    passport.authenticate( 'google', {
        successRedirect: '/dashboard',
        failureRedirect: '/login'
}));

//Define the Login Route
app.get("/login", (req, res) => {
    if (req.isAuthenticated()) { res.redirect('dashboard') }
    else { res.render("login") }
})


//Use the req.isAuthenticated() function to check if user is Authenticated
checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() && req.user.email=='pmclub@gmail.com') { return next() }
  if (req.isAuthenticated()) {
    req.logOut();
    res.redirect("/login")
    console.log('------> Logged out bad user')
  }
  else { res.redirect("login") }
}

//Define the Protected Route, by using the "checkAuthenticated" function defined above as middleware
app.get("/dashboard", checkAuthenticated, (req, res) => {
  res.render("dashboard", {name: req.user.displayName})
})

app.post("/new_event", checkAuthenticated, (req, res) => {
  connection.query("INSERT INTO pmc.events ( type, title, descr, date, begin, end, loc, body ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [req.body.eventtype, req.body.title, req.body.descr, req.body.date, req.body.begin, req.body.end, req.body.loc, req.body.body], (err, rows, fields) => {
    if (err) throw err;
    console.log('New event added')
  })

  res.redirect("/dashboard")
})

app.post("/delete_event", checkAuthenticated, (req, res) => {
  // This is really bad, I'm sorry lol
  const del_id = Object.keys(JSON.parse(JSON.stringify(req.body)))[0];
  connection.query("DELETE FROM pmc.events WHERE id = '" + del_id + "'", (err, rows, fields) => {
    if (err) throw err;
    for (var i = 0; i < rows.length; i++) {
      console.log('Event deleted: ' + del_id);
    }
  })
  res.redirect("/dashboard")
})

app.post("/query_events", checkAuthenticated, (req, res) => {
  const { search } = req.body;
  console.log(search);
  // ... do whatever you want and send a response, e.g.:
  connection.query("SELECT * FROM pmc.events WHERE date = '" + search + "'", (err, rows, fields) => {
    if (err) throw err;
    console.log(search);
    console.log(rows);
    res.json(rows);
  })
})

app.get("/logout", (req,res) => {
    req.logOut()
    res.redirect("/login")
    console.log(`-------> User Logged out`)
})
//Define the Logout
app.post("/logout", (req,res) => {
    req.logOut()
    res.redirect("/login")
    console.log(`-------> User Logged out`)
})

/* /OAUTH WORK */

app.use(express.static('public'));

console.log('Static directory '+path.join(__dirname, '/public'));

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, '/views'))

app.get('/', (req, res) => {
  connection.query('SELECT * FROM pmc.events ORDER BY date DESC LIMIT 3', (err, rows, fields) => {
    if (err) throw err
    //console.log(rows);
    res.render('index', { posts: rows });
  });
});
app.get('/about', (req, res) => {
  res.render('about')
});

Date.prototype.yyyymmdd = function() {
  var mm = this.getMonth() + 1; // getMonth() is zero-based
  var dd = this.getDate();

  return [this.getFullYear(),
          (mm>9 ? '' : '0') + mm,
          (dd>9 ? '' : '0') + dd
          ].join('');
        };
function getTerm(date) {
  // date given as yyyy-mm-dd
  let month = parseInt(date.slice(5,7));
  return (month < 5 ? 'w' : (month < 9 ? 's' : 'f')) + date.slice(2,4);
}
// Redirect to most recent term
app.get('/events', (req, res) => {
  connection.query('SELECT * FROM pmc.events ORDER BY date DESC LIMIT 1', (err, rows, fields) => {
    if (err) throw err
    res.redirect('/events/' + getTerm(rows[0].date.yyyymmdd()))
  });
  //res.render('events')
});
app.get('/const', (req, res) => {
  res.render('const')
});

function getIneq(term) {
  var str = "20" + term.slice(1,3) + '-0'
  if (term[0] == 'w') { str += '1' }
  if (term[0] == 's') { str += '5' }
  if (term[0] == 'f') { str += '9' }
  str += ("-01' AND date <= '20" + term.slice(1,3)) + '-'
  if (term[0] == 'w') { str += "04-30" }
  if (term[0] == 's') { str += "08-31" }
  if (term[0] == 'f') { str += "12-31" }
  return str;
}

app.get('/events/:term', (req, res) => {
  const t = req.params.term;
  if (t.length != 3 || (t[0] != 'w' && t[0] != 's' && t[0] != 'f') || isNaN(parseInt(t[1])) || isNaN(parseInt(t[2]))) {
    res.status(404);
    res.render('error');
    return;
  }
  connection.query("SELECT * FROM pmc.events WHERE date >= '"+getIneq(req.params.term)+"' ORDER BY date", (err, rows, fields) => {
    console.log(req.params.term)
    console.log("SELECT * FROM pmc.events WHERE date >= '"+getIneq(req.params.term)+"' ORDER BY date")
    for (var i = 0; i < rows.length; i++) {
      console.log(rows)
      var converter = new showdown.Converter();
      rows[i].body = converter.makeHtml(rows[i].body);
    }
    res.render('event', { posts: rows, reqTerm: req.params.term })
  });
});


app.use(function(req, res, next) {
  res.status(404);
  res.render('error');
});

app.use(function(req, res, next) {
  res.status(500);
  res.render('error');
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})
