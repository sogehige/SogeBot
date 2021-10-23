import {
  command, default_permission,
} from '../decorators';
import { defaultPermissions } from '../helpers/permissions/';
import Overlay from './_interface';

class TextToSpeech extends Overlay {
  @command('!tts')
  @default_permission(defaultPermissions.CASTERS)
  textToSpeech(opts: CommandOptions): CommandResponse[] {
    this.emit('speak', {
      text:      opts.parameters,
      highlight: opts.attr.highlight,
    });
    return [];
  }
}

export default new TextToSpeech();
