import { Request, Response } from 'express';
import QueryString from 'qs';
import { TypedEmitter } from 'tiny-typed-emitter';

interface Events {
  'services::twitch::emotes': (type: 'explode' | 'firework', emotes: string[]) => void,
  'services::twitch::eventsub': (req: Request<Record<string, any>, any, any, QueryString.ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>>) => void,
  'services::twitch::api::init': (type: 'broadcaster' | 'bot') => void,

  'change': (path: string, value: any) => void,
  'load': (path: string, value: any) => void,

  'set': (nsp: string, variableName: string, value: unknown, cb?: () => void) => void,
}

class interfaceEmitter extends TypedEmitter<Events> {}
const emitter = new interfaceEmitter();
emitter.setMaxListeners(100);

export default emitter;