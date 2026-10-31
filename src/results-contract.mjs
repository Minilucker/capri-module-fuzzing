export const resultFields = ['url', 'status', 'length', 'words', 'lines', 'input', 'position', 'content-type', 'redirectlocation', 'duration', 'resultfile', 'host', 'scraper'];
const count = description => ({ type: 'integer', minimum: 0, description });
export const resultFilters = { type: 'object', additionalProperties: false, description: 'Filters applied to every saved result before pagination. Numeric bounds are inclusive.', properties: {
  status: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 100, maximum: 599 }, description: 'Include these HTTP status codes.' },
  min_bytes: count('Minimum response length in bytes.'), max_bytes: count('Maximum response length in bytes.'),
  min_words: count('Minimum response word count.'), max_words: count('Maximum response word count.'),
  min_lines: count('Minimum response line count.'), max_lines: count('Maximum response line count.'),
  url_contains: { type: 'string', description: 'Literal, case-sensitive substring of the result URL; not a regular expression.' }
} };
