module.exports = {
  handleLiteLight: async (ctx) => {
    await ctx.reply(
      '⚡ *LITE LIGHT*\n\n' +
      '🚧 *Coming Soon!*\n\n' +
      'We are working on bringing you this exciting feature.\n' +
      'Stay tuned for updates!\n\n' +
      '📞 *Contact:* @opuenekeke for more information',
      { parse_mode: 'MarkdownV2' }
    );
  }
};