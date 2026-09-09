const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { pool } = require('./db');

const providers = { google: false, facebook: false };

// Temporarily disabled — flip to true to bring Facebook login back. This
// also removes the button on the front end, since it's driven by
// providers.facebook, and disables the /auth/facebook routes in server.js,
// since those are only registered when providers.facebook is true.
const FACEBOOK_LOGIN_ENABLED = false;

async function upsertUser({ id, provider, name, email, avatarUrl }) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, provider, name, email, avatar_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = $3, email = $4, avatar_url = $5
     RETURNING *`,
    [id, provider, name, email, avatarUrl]
  );
  return rows[0];
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.google = true;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await upsertUser({
            id: `google:${profile.id}`,
            provider: 'google',
            name: profile.displayName || 'Host',
            email: profile.emails?.[0]?.value || null,
            avatarUrl: profile.photos?.[0]?.value || null,
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

if (FACEBOOK_LOGIN_ENABLED && process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.facebook = true;
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        callbackURL: '/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'emails', 'photos'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await upsertUser({
            id: `facebook:${profile.id}`,
            provider: 'facebook',
            name: profile.displayName || 'Host',
            email: profile.emails?.[0]?.value || null,
            avatarUrl: profile.photos?.[0]?.value || null,
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

module.exports = { passport, providers };
