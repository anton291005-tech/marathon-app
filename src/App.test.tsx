import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders marathon planner shell', async () => {
  render(<App />);
  expect(await screen.findByText(/Sub-2:50 Marathonplan/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /📅 Wochenplan/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /📊 Übersicht/i })).toBeInTheDocument();
});
