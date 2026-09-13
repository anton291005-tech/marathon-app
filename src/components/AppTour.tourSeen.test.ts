jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

import { Preferences } from '@capacitor/preferences';
import { hasSeenTour, markTourSeen, TOUR_SEEN_KEY } from './AppTour';

const mockGet = Preferences.get as jest.Mock;
const mockSet = Preferences.set as jest.Mock;

describe('AppTour persistence', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    localStorage.clear();
  });

  it('returns false when neither Preferences nor legacy localStorage flag is set', async () => {
    mockGet.mockResolvedValue({ value: null });
    await expect(hasSeenTour()).resolves.toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns true when the Preferences flag is already set', async () => {
    mockGet.mockResolvedValue({ value: 'true' });
    await expect(hasSeenTour()).resolves.toBe(true);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('migrates a legacy localStorage flag into Preferences and returns true', async () => {
    mockGet.mockResolvedValue({ value: null });
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    await expect(hasSeenTour()).resolves.toBe(true);
    expect(mockSet).toHaveBeenCalledWith({ key: TOUR_SEEN_KEY, value: 'true' });
  });

  it('markTourSeen writes the flag to Preferences', async () => {
    mockSet.mockResolvedValue(undefined);
    await markTourSeen();
    expect(mockSet).toHaveBeenCalledWith({ key: TOUR_SEEN_KEY, value: 'true' });
  });
});
