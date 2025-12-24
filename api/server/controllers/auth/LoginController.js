const { logger } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');

const isMongoObjectIdLike = (s) => typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);

const resolveUserId = (reqUser) => {
  if (!reqUser) return null;

  const asString = (v) => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v?.toString === 'function') return v.toString();
    return null;
  };

  // Prefer actual Mongo IDs
  const directId =
    asString(reqUser._id) ||
    asString(reqUser.id) ||
    asString(reqUser?.userId) ||
    asString(reqUser?._doc?._id) ||
    asString(reqUser?._doc?.id);

  if (directId) return directId;

  // Only accept sub if it looks like a Mongo ObjectId
  const sub = asString(reqUser.sub);
  if (sub && isMongoObjectIdLike(sub)) return sub;

  return null;
};

async function LoginController(req, res) {
  try {
    if (!req.user) {
      return res.status(401).send({ message: 'Unauthorized' });
    }

    const userIdStr = resolveUserId(req.user);

    if (!userIdStr) {
      logger.error('[LoginController] Could not resolve user id from req.user');
      if (process.env.NODE_ENV === 'development') {
        try {
          logger.debug('[LoginController] req.user snapshot:', req.user);
        } catch (_) {
          // ignore
        }
      }
      return res.status(500).send({ message: 'Login failed' });
    }

    // If user has 2FA enabled, issue a temp token for the second factor step
    if (req.user.totpEnabled) {
      const tempToken = await generate2FATempToken(userIdStr);
      return res.status(200).send({ twoFactorRequired: true, tempToken });
    }

    // Strip sensitive fields if present
    const { password: _p, totpSecret: _t, __v, ...user } = req.user;

    // Ensure frontend has a stable `id`
    user.id = userIdStr;

    const token = await setAuthTokens(userIdStr, res);

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[LoginController] Error during login', err);
    return res.status(500).send({ message: 'An error occurred during login' });
  }
}

// Export both default + named so auth.js can import either way
module.exports = LoginController;
module.exports.LoginController = LoginController;
module.exports.loginController = LoginController;
