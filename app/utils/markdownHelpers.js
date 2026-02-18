// app/utils/markdownHelpers.js

function escapeMarkdownV2(text) {
  if (typeof text !== 'string') {
    if (text === null || text === undefined) return '';
    text = text.toString();
  }
  
  // Simple escape: replace all special characters with escaped versions
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  
  let escaped = text;
  specialChars.forEach(char => {
    // Replace ALL occurrences of the character
    escaped = escaped.split(char).join('\\' + char);
  });
  
  return escaped;
}

function escapeMarkdown(text) {
  return escapeMarkdownV2(text);
}

module.exports = {
  escapeMarkdownV2,
  escapeMarkdown
};