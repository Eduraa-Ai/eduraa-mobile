import { Easing } from 'react-native'

export const motion = {
  duration: {
    fast: 140,
    quick: 180,
    normal: 260,
    slow: 420,
    slower: 640,
  },
  easing: {
    standard: Easing.bezier(0.4, 0, 0.2, 1),
    entrance: Easing.bezier(0.2, 0.8, 0.2, 1),
    exit: Easing.bezier(0.4, 0, 1, 1),
    emphasized: Easing.bezier(0.2, 0, 0, 1),
  },
  spring: {
    responsive: {
      damping: 18,
      stiffness: 220,
      mass: 0.9,
    },
    gentle: {
      damping: 22,
      stiffness: 150,
      mass: 1,
    },
    tab: {
      damping: 16,
      stiffness: 260,
      mass: 0.8,
    },
  },
  press: {
    scale: 0.97,
    opacity: 0.9,
    duration: 120,
  },
  cardEntrance: {
    translateY: 16,
    stagger: 52,
    duration: 360,
  },
  screenTransition: {
    translateY: 10,
    duration: 280,
  },
  skeleton: {
    duration: 1150,
    shimmerWidth: 140,
  },
  tabSelection: {
    scale: 1.04,
    duration: 220,
  },
  modal: {
    translateY: 28,
    duration: 300,
  },
  aiTyping: {
    dotDelay: 120,
    dotDuration: 520,
  },
  progress: {
    duration: 820,
  },
} as const

export default motion
