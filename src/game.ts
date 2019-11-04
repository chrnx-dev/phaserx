import Phaser from 'phaser';

const config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 800,
  height: 600,
  scene: {
    preload,
    create
  }
};

const game = new Phaser.Game(config);

function preload() {}

function create() {  }
