import { describe, expect, it } from 'vitest';
import {
  cleanRecoveryUrl,
  passwordProblem,
  recoveryLocation,
} from './recovery';
describe('password recovery callbacks', () => {
  it('recognizes implicit recovery links and explicit PKCE redirects without treating normal navigation as recovery', () => {
    expect(
      recoveryLocation(
        'https://preview.test/#access_token=fake&refresh_token=fake&type=recovery',
      ).implicit,
    ).toBe(true);
    expect(
      recoveryLocation('https://preview.test/?auth=recovery&code=one-use')
        .requested,
    ).toBe(true);
    expect(recoveryLocation('https://preview.test/#Calendar').requested).toBe(
      false,
    );
    expect(
      recoveryLocation('https://preview.test/#access_token=fake&type=signup')
        .requested,
    ).toBe(false);
  });
  it('recognizes errors in fragment and query, including old unmarked redirects', () => {
    expect(
      recoveryLocation(
        'https://preview.test/#error=access_denied&error_code=otp_expired',
      ).failed,
    ).toBe(true);
    expect(
      recoveryLocation('https://preview.test/?error=invalid_request').requested,
    ).toBe(true);
  });
  it('removes callback credentials and error descriptions while preserving unrelated navigation and the recovery marker', () => {
    expect(
      cleanRecoveryUrl(
        'https://preview.test/?auth=recovery&code=fake&other=1#access_token=fake&refresh_token=fake&type=recovery',
        true,
      ),
    ).toBe('/?auth=recovery&other=1');
    expect(
      cleanRecoveryUrl(
        'https://preview.test/?auth=recovery&error_description=fake#Calendar',
        false,
      ),
    ).toBe('/#Calendar');
  });
  it('requires matching passwords and at least eight characters', () => {
    expect(passwordProblem('short', 'short')).not.toBe('');
    expect(passwordProblem('Long-Test-123!', 'different')).not.toBe('');
    expect(passwordProblem('Long-Test-123!', 'Long-Test-123!')).toBe('');
  });
});
