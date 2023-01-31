import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BotEntity } from '../BotEntity';

export interface Reference {
  typeId: 'reference',
  overlayId: string;
  groupId: string;
}

export interface Chat {
  typeId: 'chat';
  type: 'vertical' | 'horizontal' | 'niconico';
  hideMessageAfter: number;
  showTimestamp: boolean;
  reverseOrder: boolean;
  showBadges: boolean;
  font: {
    family: string;
    size: number;
    borderPx: number;
    borderColor: string;
    weight: number;
    color: string;
    shadow: {
      shiftRight: number;
      shiftDown: number;
      blur: number;
      opacity: number;
      color: string;
    }[];
  }
}

export interface Marathon {
  typeId: 'marathon';
  disableWhenReachedZero: boolean;
  showProgressGraph: boolean;
  endTime: number;
  maxEndTime: number | null;
  showMilliseconds: boolean;
  values: {
    sub: {
      tier1: number;
      tier2: number;
      tier3: number;
    },
    resub: {
      tier1: number;
      tier2: number;
      tier3: number;
    },
    bits: {
      /*
         * true:  value:bits is set to 10 and we got 15 -> 1.5x value will get added
         * false: value:bits is set to 10 and we got 15 -> 1.0x value will get added
         */
      addFraction: boolean;
      bits: number;
      time: number;
    },
    tips: {
      /*
         * true:  value:tip is set to 10 and we got 15 -> 1.5x value will get added
         * false: value:tip is set to 10 and we got 15 -> 1.0x value will get added
         */
      addFraction: boolean;
      tips: number;
      time: number;
    },
  }
  marathonFont: {
    family: string;
    size: number;
    borderPx: number;
    borderColor: string;
    weight: number;
    color: string;
    shadow: {
      shiftRight: number;
      shiftDown: number;
      blur: number;
      opacity: number;
      color: string;
    }[];
  }
}

export interface Stopwatch {
  typeId: 'stopwatch';
  currentTime: number;
  isPersistent: boolean;
  isStartedOnSourceLoad: boolean;
  showMilliseconds: boolean;
  stopwatchFont: {
    family: string;
    size: number;
    borderPx: number;
    borderColor: string;
    weight: number;
    color: string;
    shadow: {
      shiftRight: number;
      shiftDown: number;
      blur: number;
      opacity: number;
      color: string;
    }[];
  }
}

export interface Wordcloud {
  typeId: 'wordcloud';
  fadeOutInterval: number;
  fadeOutIntervalType: 'seconds' | 'minutes' | 'hours';
  wordFont: {
    family: string;
    weight: number;
    color: string;
  }
}

export interface Countdown {
  typeId: 'countdown';
  time: number;
  currentTime: number;
  isPersistent: boolean;
  isStartedOnSourceLoad: boolean;
  messageWhenReachedZero: string;
  showMessageWhenReachedZero: boolean;
  showMilliseconds: boolean;
  countdownFont: {
    family: string;
    size: number;
    borderPx: number;
    borderColor: string;
    weight: number;
    color: string;
    shadow: {
      shiftRight: number;
      shiftDown: number;
      blur: number;
      opacity: number;
      color: string;
    }[];
  }
  messageFont: {
    family: string;
    size: number;
    borderPx: number;
    borderColor: string;
    weight: number;
    color: string;
    shadow: {
      shiftRight: number;
      shiftDown: number;
      blur: number;
      opacity: number;
      color: string;
    }[];
  }
}

export interface Credits {
  typeId: 'credits';
  social: {
    type: string, text: string;
  }[],
  speed: 'very slow' | 'slow' | 'medium' | 'fast' | 'very fast',
  customTexts: {
    type: 'bigHeader' | 'header' | 'text' | 'smallText' | 'separator',
    left: string,
    middle: string,
    right: string,
  }[],
  clips: {
    play: boolean,
    period: 'custom' | 'stream',
    periodValue: number,
    numOfClips: number,
    volume: number,
  },
  text:  {
    lastMessage:      string,
    lastSubMessage:   string,
    streamBy:         string,
    follow:           string,
    raid:             string,
    cheer:            string,
    sub:              string,
    resub:            string,
    subgift:          string,
    subcommunitygift: string,
    tip:              string,
  },
  show: {
    follow:           boolean,
    raid:             boolean,
    sub:              boolean,
    subgift:          boolean,
    subcommunitygift: boolean,
    resub:            boolean,
    cheer:            boolean,
    clips:            boolean,
    tip:              boolean,
  }
}
export interface Eventlist {
  typeId: 'eventlist';
  count: number,
  ignore: string[]
  display: string[],
  order: 'asc' | 'desc',
}

export interface Clips {
  typeId: 'clips';
  volume: number,
  filter: 'none' | 'grayscale' | 'sepia' | 'tint' | 'washed',
  showLabel: boolean,
}

export interface Alerts {
  typeId: 'media';
  galleryCache: boolean,
  galleryCacheLimitInMb: number,
}

export interface Emotes {
  typeId: 'emotes';
  emotesSize: 1 | 2 | 3,
  maxEmotesPerMessage: number,
  animation: 'fadeup' | 'fadezoom' | 'facebook',
  animationTime: number,
  maxRotation: number,
  offsetX: number,
}

export interface EmotesCombo {
  typeId: 'emotescombo';
  showEmoteInOverlayThreshold: number,
  hideEmoteInOverlayAfter: number,
}

export interface EmotesFireworks {
  typeId: 'emotesfireworks';
  emotesSize: 1 | 2 | 3,
  animationTime: number,
  numOfEmotesPerExplosion: number,
  numOfExplosions: number,
}
export interface EmotesExplode {
  typeId: 'emotesexplode';
  emotesSize: 1 | 2 | 3,
  animationTime: number,
  numOfEmotes: number,
}
export interface Carousel {
  typeId: 'carousel';
}

export interface HypeTrain {
  typeId: 'hypetrain';
}

export interface ClipsCarousel {
  typeId: 'clipscarousel';
  customPeriod: number,
  numOfClips: number,
  volume: number,
  animation: string,
}

export interface TTS {
  typeId: 'tts';
  voice: string,
  volume: number,
  rate: number,
  pitch: number,
  triggerTTSByHighlightedMessage: boolean,
}

export interface Polls {
  typeId: 'polls';
  theme: 'light' | 'dark' | 'Soge\'s green',
  hideAfterInactivity: boolean,
  inactivityTime: number,
  align: 'top' | 'bottom',
}

export interface OBSWebsocket {
  typeId: 'obswebsocket';
  allowedIPs: string[],
}

export interface AlertsRegistry {
  typeId: 'alertsRegistry' | 'textRegistry';
  id: string,
}

export interface URL {
  typeId: 'url';
  url: string,
}

export interface Group {
  typeId: 'group';
  canvas: {
    width: number;
    height: number;
  },
  items: {
    id: string;
    width: number;
    height: number;
    alignX: number;
    alignY: number;
  }[],
}

@Entity()
export class Overlay extends BotEntity<Overlay> {
  @PrimaryColumn({ generated: 'uuid' })
    id: string;

  @Column()
    name: string;

  @Column({ type: (process.env.TYPEORM_CONNECTION ?? 'better-sqlite3') !== 'better-sqlite3' ? 'json' : 'simple-json' })
    canvas: {
    width: number;
    height: number;
  };

  @Column({ type: (process.env.TYPEORM_CONNECTION ?? 'better-sqlite3') !== 'better-sqlite3' ? 'json' : 'simple-json' })
    items: {
    id: string;
    width: number;
    height: number;
    alignX: number;
    alignY: number;
    name: string;
    opts:
    URL | Chat | Reference | AlertsRegistry | Carousel | Marathon | Stopwatch |
    Countdown | Group | Eventlist | EmotesCombo | Credits | Clips | Alerts |
    Emotes | EmotesExplode | EmotesFireworks | Polls | TTS | OBSWebsocket |
    ClipsCarousel | HypeTrain;
  }[];
}