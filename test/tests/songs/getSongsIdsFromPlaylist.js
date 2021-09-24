/* eslint-disable @typescript-eslint/no-var-requires */
/* global describe it  */

require('../../general.js');
const assert = require('assert');
const songs = (require('../../../dest/systems/songs')).default;

describe('Songs - getSongsIdsFromPlaylist() - @func1', () => {
  describe('Load songs ids', () => {
    let ids = [];
    it(`Load playlist video IDs`, async () => {
      ids = await songs.getSongsIdsFromPlaylist('https://www.youtube.com/playlist?list=PLjpw-QGgMkeDv8N68j2WCMPlmOBH-_Lw2')
    });

    for (const id of ['lm4OJxGQm_E', 'q8Vk8Wx0xJo', 'fugQAnzL1uk']) {
      it(`${id} should be returned by playlist`, async () => {
        assert(ids.includes(id));
      });
    }
  });
});
