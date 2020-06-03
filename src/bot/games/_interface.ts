import Module from '../_interface';

class Game extends Module {
  constructor() {
    super('games', false);
    this.addMenu({ category: 'settings', name: 'games', id: 'settings/games', this: null });
  }
}

export default Game;
