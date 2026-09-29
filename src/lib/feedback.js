// Feedback widget storage + submit handling.

const STORAGE_KEY = 'ship-with-ai-feedback';

export const FEEDBACK_LIMITS = Object.freeze({ name: 100, topic: 100, message: 5000 });

export class FeedbackValidationError extends Error {}

function validateText(value, label, maxLength, required) {
  if (typeof value !== 'string') {
    throw new FeedbackValidationError(`${label} must be text.`);
  }
  if (value.length > maxLength) {
    throw new FeedbackValidationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  const text = value.trim();
  if (required && !text) {
    throw new FeedbackValidationError(`${label} is required.`);
  }
  return text;
}

export function loadSubmissions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSubmission(name, message, topic) {
  const submission = {
    name: validateText(name, 'Name', FEEDBACK_LIMITS.name, false),
    message: validateText(message, 'Message', FEEDBACK_LIMITS.message, true),
    topic: validateText(topic, 'Topic', FEEDBACK_LIMITS.topic, true),
    submittedAt: new Date().toISOString(),
  };
  const submissions = loadSubmissions();
  submissions.push(submission);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
  return submissions;
}
