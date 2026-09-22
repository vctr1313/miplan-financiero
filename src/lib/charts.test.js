import { Chart } from 'chart.js'
import { applyChartTheme } from './charts'

// Theming must work on a bare Chart.js with nothing registered yet --
// that's what a tree-shaken production bundle looks like at startup,
// and a throw here leaves the whole app blank.
test('the chart theme applies before any chart has been imported', () => {
  expect(() => applyChartTheme()).not.toThrow()
  expect(Chart.defaults.datasets.doughnut.cutout).toBe('70%')
  expect(Chart.defaults.datasets.bar.maxBarThickness).toBe(28)
})
