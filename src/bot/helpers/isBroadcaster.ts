import oauth from '../oauth';

export function isBroadcaster(user: string | CommandOptions['sender'] | { username: string | null; userId?: number | string } | UserStateTags) {
  try {
    return oauth.broadcasterUsername.toLowerCase().trim() === (typeof user === 'string' ? user : user.username?.toLowerCase().trim());
  } catch (e) {
    return false;
  }
}