import { describe, it, expect } from 'vitest';
import { matchPath } from '../lib/router';

describe('Client Router matchPath', () => {
  it('matches static and dynamic routes', () => {
    expect(matchPath('/lists/:id', '/lists/42')).toEqual({ id: '42' });
    expect(matchPath('/shared/:token', '/shared/abc-123')).toEqual({ token: 'abc-123' });
    expect(matchPath('/santa/view/:token', '/santa/view/secret-token')).toEqual({ token: 'secret-token' });
    expect(matchPath('/santa/reveal/:token', '/santa/reveal/secret-token')).toEqual({ token: 'secret-token' });
  });

  it('returns null on mismatched paths', () => {
    expect(matchPath('/lists/:id', '/family')).toBeNull();
    expect(matchPath('/lists/:id', '/lists/42/sub')).toBeNull();
  });
});
