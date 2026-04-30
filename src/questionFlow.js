// @ts-check

import {
  QUESTION_DEFINITIONS,
  QUESTION_MODE_SECTIONS,
  QUESTION_SECTION_LABELS,
} from "./questionDefinitions.js";

export function getQuestionMode(bundle) {
  const mode = bundle?.start_context?.record_mode || "quick";
  if (mode === "photo_first") {
    return "photo_first";
  }
  if (mode === "detailed") {
    return "detailed";
  }
  return "quick";
}

export function getQuestionDefinitions(mode) {
  return QUESTION_DEFINITIONS[mode] ?? QUESTION_DEFINITIONS.quick;
}

export function isQuestionStep(bundle, stepId) {
  return getVisibleQuestions(bundle).some((question) => question.id === stepId);
}

export function getVisibleQuestions(bundle) {
  const mode = getQuestionMode(bundle);
  return getQuestionDefinitions(mode).filter((question) =>
    typeof question.visibleWhen === "function" ? question.visibleWhen(bundle) : true,
  );
}

export function getQuestionById(bundle, questionId) {
  return getVisibleQuestions(bundle).find((question) => question.id === questionId) ?? null;
}

export function getFirstQuestionId(bundle) {
  return getVisibleQuestions(bundle)[0]?.id ?? "confirm";
}

export function getNextQuestionId(bundle, currentQuestionId) {
  const visible = getVisibleQuestions(bundle);
  const index = visible.findIndex((question) => question.id === currentQuestionId);
  if (index < 0) {
    return "confirm";
  }
  return visible[index + 1]?.id ?? "confirm";
}

export function getPreviousQuestionId(bundle, currentQuestionId) {
  const visible = getVisibleQuestions(bundle);
  const index = visible.findIndex((question) => question.id === currentQuestionId);
  if (index <= 0) {
    return "start";
  }
  return visible[index - 1]?.id ?? "start";
}

export function getSectionTrail(mode) {
  return (QUESTION_MODE_SECTIONS[mode] ?? QUESTION_MODE_SECTIONS.quick).map((sectionId) => ({
    id: sectionId,
    label: QUESTION_SECTION_LABELS[sectionId] ?? sectionId,
  }));
}

export function getCurrentSectionId(bundle) {
  const stepId = bundle?.meta?.current_step || "start";
  if (stepId === "confirm") {
    return "confirm";
  }
  const question = getQuestionById(bundle, stepId);
  return question?.section ?? "result";
}

export function getSectionIndex(mode, sectionId) {
  return getSectionTrail(mode).findIndex((section) => section.id === sectionId);
}
