export default class ResultController {
  constructor (game) {
    this.game = game
  }

  async run () {
    this.game.background_screen.showResultUI(true)
    this.game.songinfo_screen.hide()
    this.game.result_screen.show()

    if (this.game.game_mode === 'normal') {
      // Only save high score if in normal mode
      this.game.songs.current_song.saveHighScore(this.game.score.getClass(), this.game.score.score)
    }
    const song = this.game.songs.current_song
    this.game.result_screen.setSong(song)
    this.game.score.setToResultScreen(this.game.result_screen, {
      duration: this.game.score.play_duration || song.duration,
      referenceAverageCpm: Number(
        this.game.game_mode === 'assist' ? song.assist_cpm : song.cpm,
      ) || 0,
      referencePeakCpm: Number(
        this.game.game_mode === 'assist'
          ? song.assist_max_cpm
          : song.max_cpm,
      ) || 0,
    })

    await this.game.input.waitForAnyKey()

    this.game.reset()
    this.game.background_screen.showResultUI(false)
    this.game.result_screen.hide()
    return this.game.menu_controller
  }
}
