import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  FEEDBACK_LIMITS, FeedbackValidationError, loadSubmissions, saveSubmission,
} from '../src/lib/feedback.js';

let originalStorage;
let stored;
beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  stored = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
});

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalStorage);
  } else {
    delete globalThis.localStorage;
  }
});

test('saveSubmission persists and trims all feedback fields', () => {
  const submissions = saveSubmission(' Ada ', ' Looks good \n', ' Code review ');
  assert.deepEqual(submissions[0], {
    name: 'Ada', message: 'Looks good', topic: 'Code review',
    submittedAt: submissions[0].submittedAt,
  });
  assert.ok(Number.isFinite(Date.parse(submissions[0].submittedAt)));
  assert.deepEqual(loadSubmissions(), submissions);
});

test('an optional blank name is stored for anonymous feedback', () => {
  assert.equal(saveSubmission(' \t', 'Question', 'Deployment')[0].name, '');
});

test('required fields reject empty or whitespace-only text without writing', () => {
  const baseline = saveSubmission('Ada', 'Existing message', 'Review');
  for (const field of ['topic', 'message']) {
    for (const value of ['', ' \t\n', '\u3000']) {
      const input = { name: 'Ada', message: 'Question', topic: 'Deployment', [field]: value };
      assert.throws(
        () => saveSubmission(input.name, input.message, input.topic),
        FeedbackValidationError,
      );
      assert.deepEqual(loadSubmissions(), baseline);
    }
  }
});

test('all fields reject non-text input before accessing storage', () => {
  localStorage.getItem = () => { assert.fail('invalid input must not access storage'); };
  for (const field of Object.keys(FEEDBACK_LIMITS)) {
    for (const value of [null, undefined, 42, true, {}, []]) {
      const input = { name: 'Ada', message: 'Question', topic: 'Deployment', [field]: value };
      assert.throws(
        () => saveSubmission(input.name, input.message, input.topic),
        FeedbackValidationError,
      );
    }
  }
  assert.equal(stored.size, 0);
});

test('each text field accepts its exact limit and rejects one extra character', () => {
  for (const [field, limit] of Object.entries(FEEDBACK_LIMITS)) {
    const input = { name: 'Ada', message: 'Question', topic: 'Deployment', [field]: 'x'.repeat(limit) };
    const baseline = saveSubmission(input.name, input.message, input.topic);
    assert.equal(baseline.at(-1)[field].length, limit);
    for (const value of ['x'.repeat(limit + 1), ` ${'x'.repeat(limit)}`]) {
      input[field] = value;
      assert.throws(
        () => saveSubmission(input.name, input.message, input.topic),
        FeedbackValidationError,
      );
      assert.deepEqual(loadSubmissions(), baseline);
    }
  }
});

test('existing feedback without a topic remains readable when appending', () => {
  const legacy = { name: 'Ada', message: 'Previous feedback', submittedAt: '2026-01-01T00:00:00.000Z' };
  stored.set('ship-with-ai-feedback', JSON.stringify([legacy]));
  const submissions = saveSubmission('Grace', 'New feedback', 'Review');
  assert.equal(submissions.length, 2);
  assert.deepEqual(submissions[0], legacy);
  assert.deepEqual(loadSubmissions(), submissions);
});

test('storage failures propagate without replacing existing submissions', () => {
  const baseline = saveSubmission('Ada', 'Existing message', 'Review');
  const failure = new Error('Storage quota exceeded');
  localStorage.setItem = () => { throw failure; };
  assert.throws(() => saveSubmission('Ada', 'Question', 'Deployment'), (error) => error === failure);
  assert.deepEqual(loadSubmissions(), baseline);
});

// Exercise the actual client script with minimal DOM/storage doubles, without a browser dependency.
function createWidget() {
  const source = readFileSync(new URL('../src/components/FeedbackWidget.astro', import.meta.url), 'utf8');
  const openingTag = '<script>';
  const start = source.indexOf(openingTag);
  const end = source.indexOf('</script>', start + openingTag.length);
  assert.ok(start !== -1 && end !== -1, 'widget client script must exist');
  const script = source.slice(start + openingTag.length, end).replace(/^  import .*;\r?$/gm, '');
  let submit;
  let resets = 0;
  const values = { name: 'Ada', message: 'Question', topic: 'Deployment' };
  const form = {
    addEventListener: (event, handler) => {
      assert.equal(event, 'submit');
      submit = handler;
    },
    reset: () => { resets += 1; },
  };
  const list = { innerHTML: '' };
  const error = { hidden: true, textContent: '' };
  const elements = { 'feedback-form': form, 'feedback-list': list, 'feedback-error': error };
  runInNewContext(script, {
    document: { getElementById: (id) => elements[id] },
    FormData: class { get(key) { return values[key]; } },
    markedModule: { default: (text) => text },
    FEEDBACK_ANALYTICS_TOKEN: 'test',
    console: { debug() {} },
    FeedbackValidationError, loadSubmissions, saveSubmission,
  });
  assert.match(source, /id="feedback-error" role="alert"/);
  return {
    values, list, error,
    get resets() { return resets; },
    submit: () => submit({ preventDefault() {} }),
  };
}

test('the submit handler shows validation errors and clears them on a successful retry', () => {
  const widget = createWidget();
  widget.values.topic = ' \t';
  widget.submit();
  assert.equal(widget.error.hidden, false);
  assert.equal(widget.error.textContent, 'Topic is required.');
  assert.equal(widget.resets, 0);
  assert.equal(stored.size, 0);
  assert.equal(widget.list.innerHTML, '');
  widget.values.topic = 'Review <script>';
  widget.submit();
  assert.equal(widget.error.hidden, true);
  assert.equal(widget.error.textContent, '');
  assert.equal(widget.resets, 1);
  assert.match(widget.list.innerHTML, /Review &lt;script&gt;/);
  assert.match(widget.list.innerHTML, /Question/);
  assert.equal(loadSubmissions()[0].topic, 'Review <script>');
});

test('submitted and previously stored names are escaped when rendered', () => {
  const legacyName = '<IMG SRC=x ONERROR=alert(1)>';
  stored.set('ship-with-ai-feedback', JSON.stringify([{
    name: legacyName, message: 'Previous feedback', submittedAt: '2026-01-01T00:00:00.000Z',
  }]));
  const widget = createWidget();
  assert.ok(widget.list.innerHTML.includes('&lt;IMG SRC=x ONERROR=alert(1)&gt;'));
  assert.ok(!widget.list.innerHTML.includes(legacyName));

  const submittedName = '<img src=x onerror=alert(2)>';
  widget.values.name = submittedName;
  widget.submit();
  assert.equal(widget.error.hidden, true);
  assert.ok(widget.list.innerHTML.includes('&lt;img src=x onerror=alert(2)&gt;'));
  assert.ok(!widget.list.innerHTML.includes(submittedName));
  assert.equal(loadSubmissions().at(-1).name, submittedName);
});

for (const operation of ['getItem', 'setItem']) {
  test(`the submit handler displays storage ${operation} failures without clearing the form`, () => {
    const widget = createWidget();
    localStorage[operation] = () => { throw new Error('Storage unavailable'); };
    widget.submit();
    assert.equal(widget.error.hidden, false);
    assert.match(widget.error.textContent, /Unable to save feedback/);
    assert.equal(widget.resets, 0);
    assert.equal(widget.list.innerHTML, '');
    assert.equal(stored.size, 0);
  });
}
