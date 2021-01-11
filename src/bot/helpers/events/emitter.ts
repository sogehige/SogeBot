import { TypedEmitter } from 'tiny-typed-emitter';

interface Events {
  'action': (opts: { username: string; source: 'discord' | 'twitch' }) => void;
  'commercial': (opts: { duration: number }) => void;
  'game-changed': (opts: {oldGame: string, game: string}) => void;
  'follow': (opts: {username: string, userId: number, webhooks?: boolean}) => void;
  'cheer': (opts: {username: string, bits: number, message: string}) => void;
  'unfollow': (opts: {username: string}) => void;
  'user-joined-channel': (opts: {username: string}) => void;
  'user-parted-channel': (opts: {username: string}) => void;
  'subcommunitygift': (opts: {username: string; count: number}) => void;
  'reward-redeemed': (opts: {username: string; titleOfReward: string; userInput: string;}) => void;
  'timeout': (opts: {username: string; duration: number}) => void;
  'ban': (opts: {username: string; reason: string}) => void;
  'hosting': (opts: {target: string, viewers: number}) => void;
  'hosted': (opts: {username: string, viewers: number, event: string, timestamp: number}) => void;
  'raid': (opts: {username: string, viewers: number, event: string, timestamp: number}) => void;
  'stream-started': () => void;
  'stream-stopped': () => void;
  'subscription': (opts: { username: string; method: string; subCumulativeMonths: number; tier: string}) => void;
  'resub': (opts: { username: string; subStreakShareEnabled: boolean, subStreak: number; subStreakName: string; subCumulativeMonthsName: string; message: string; subCumulativeMonths: number; tier: string}) => void;
  'clearchat': () => void;
  'command-send-x-times': (opts: { reset: boolean } | { username: string, message: string, source: 'discord' | 'twitch' }) => void;
  'keyword-send-x-times': (opts: { reset: boolean } | { username: string, message: string, source: 'discord' | 'twitch' }) => void;
  'every-x-minutes-of-stream': (opts: { reset: boolean }) => void;
  'stream-is-running-x-minutes': (opts: { reset: boolean }) => void;
  'subgift': (opts: { username: string; recipient: string; tier: number; }) => void;
  'number-of-viewers-is-at-least-x': (opts: { reset: boolean }) => void;
  'tip': (opts: { username: string, amount: string; currency: string; amountInBotCurrency: string; currencyInBot: string; message: string; }) => void;
  'tweet-post-with-hashtag': (opts: { tweet: any }) => void;
}

class _EventEmitter extends TypedEmitter<Events> {}
const eventEmitter = new _EventEmitter();

export { eventEmitter };