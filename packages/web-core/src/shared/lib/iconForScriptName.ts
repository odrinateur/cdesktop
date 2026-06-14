import type { Icon } from '@phosphor-icons/react';
import {
  BroomIcon,
  HammerIcon,
  PlayIcon,
  FlaskIcon,
  PaintBrushIcon,
  CheckCircleIcon,
  EraserIcon,
  TerminalIcon,
  PackageIcon,
  RocketIcon,
  ShieldCheckIcon,
  BookOpenIcon,
} from '@phosphor-icons/react';

/**
 * Pick a Phosphor icon for a package.json script based on its name.
 * Falls back to a generic terminal icon when nothing matches.
 */
export function iconForScriptName(name: string): Icon {
  const n = name.toLowerCase();

  if (/^(dev|serve|start|watch)\b/.test(n) || n.includes('dev')) {
    return PlayIcon;
  }
  if (n.includes('lint') || n.includes('eslint')) {
    return BroomIcon;
  }
  if (n.includes('format') || n.includes('prettier')) {
    return PaintBrushIcon;
  }
  if (
    n.includes('typecheck') ||
    n === 'check' ||
    n.includes('tsc') ||
    n.includes('check')
  ) {
    return CheckCircleIcon;
  }
  if (n.includes('test') || n.includes('vitest') || n.includes('jest')) {
    return FlaskIcon;
  }
  if (n.includes('build') || n.includes('compile') || n.includes('bundle')) {
    return HammerIcon;
  }
  if (n.includes('clean') || n.includes('reset')) {
    return EraserIcon;
  }
  if (n.includes('publish') || n.includes('release')) {
    return RocketIcon;
  }
  if (n.includes('package') || n.includes('pack')) {
    return PackageIcon;
  }
  if (n.includes('audit') || n.includes('security')) {
    return ShieldCheckIcon;
  }
  if (n.includes('doc') || n.includes('storybook')) {
    return BookOpenIcon;
  }
  return TerminalIcon;
}
