import { beforeEach, afterEach } from 'vitest';
import { setActiveStyle } from './style-state';

beforeEach(() => {
  setActiveStyle('palace');
});

afterEach(() => {
  setActiveStyle('palace');
});
