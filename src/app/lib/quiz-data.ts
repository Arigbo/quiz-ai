export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  type: 'radio' | 'checkbox';
}

export const mockQuiz: QuizQuestion[] = [
  {
    id: 'q1',
    question: "Which architectural pattern is primarily used for decoupling state updates from UI components in React apps?",
    options: [
      "Flux Architecture",
      "Model-View-Controller",
      "Repository Pattern",
      "Singleton Pattern"
    ],
    type: 'radio'
  },
  {
    id: 'q2',
    question: "What is the primary benefit of using Server Components in Next.js?",
    options: [
      "Increased client-side bundle size",
      "Automatic code-splitting for all components",
      "Reduced client-side JavaScript execution",
      "Mandatory client-side rendering"
    ],
    type: 'radio'
  },
  {
    id: 'q3',
    question: "Which CSS property is most commonly used to create flexible grid-based layouts without media queries?",
    options: [
      "display: flex",
      "grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))",
      "position: absolute",
      "float: left"
    ],
    type: 'radio'
  },
  {
    id: 'q4',
    question: "Which of the following hooks is used to memoize expensive computations in React?",
    options: [
      "useCallback",
      "useEffect",
      "useMemo",
      "useRef"
    ],
    type: 'radio'
  }
];
