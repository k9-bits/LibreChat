const { logger } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');

/**
 * Safely resolve the user's Mongo id from common shapes:
 * - Mongoose doc: user._id
 * - Lean object: user.id
 * - Nested doc: user._doc._id
 * - OIDC/JWT: user.sub / user.userId (ONLY if it looks like a Mongo ObjectId)
 */
const resolveUserId = (reqUser) => {
  if (!reqUser) return null;

  const asString = (v) => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v.toString === 'function') return v.toString();
    return null;
  };

  // Prefer Mongo-native identifiers
  const directId =
    asString(reqUser._id) ||
    asString(reqUser.id) ||
    asString(reqUser?._doc?._id);

  if (directId) return directId;

  // Only accept sub/userId if it looks like a Mongo ObjectId
  const candidate = asString(reqUser.userId) || asString(reqUser.sub);
  if (candidate && /^[a-fA-F0-9]{24}$/.test(candidate)) {
    return candidate;
  }

  return null;
};

module.exports = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).send({ message: 'Unauthorized' });
    }

    const userIdStr = resolveUserId(req.user);

    if (!userIdStr) {
      logger.error('[LoginController] Could not resolve user id from req.user');
      return res.status(500).send({ message: 'Login failed' });
    }

    // If user has 2FA enabled, issue a temp token for the second factor step
    if (req.user.totpEnabled) {
      const tempToken = await generate2FATempToken(userIdStr);
      return res.status(200).send({ twoFactorRequired: true, tempToken });
    }

    // Strip sensitive fields if present
    const { password: _p, totpSecret: _t, __v, ...user } = req.user;

    // Ensure user object has an "id" string the frontend expects
    user.id = userIdStr;

    // Set auth tokens using resolved user id
    const token = await setAuthTokens(userIdStr, res);

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[LoginController] Error during login', err);
    return res.status(500).send({ message: 'An error occurred during login' });
  }
};
