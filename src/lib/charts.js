import {
  Chart, ArcElement, BarElement, LineElement, PointElement,
  LinearScale, CategoryScale, Tooltip, Legend, Filler,
  BarController, LineController, DoughnutController,
} from 'chart.js'

// One place that makes every Chart.js chart in the app look like it
// belongs to it: system font, no chart borders, whisper-thin grid,
// rounded bar caps, soft doughnut segments with gaps, and an iOS-style
// tooltip. Charts only set their data and the few options that are
// genuinely specific to them; everything visual inherits from here.
export function applyChartTheme() {
  // Register everything this theme touches up front. Chart.defaults.
  // elements.<type> only exists once that element is registered, and
  // pages register only what they draw -- so theming an unregistered
  // element (the arc, once no page used Chart.js doughnuts any more)
  // threw at startup and left the whole app blank. Same for
  // Chart.defaults.datasets.<type>, which needs the CONTROLLER: that
  // used to arrive as a side effect of importing react-chartjs-2, until
  // a production build tree-shook it away and blanked the app again.
  Chart.register(ArcElement, BarElement, LineElement, PointElement,
    LinearScale, CategoryScale, Tooltip, Legend, Filler,
    BarController, LineController, DoughnutController)
  const d = Chart.defaults
  d.font.family = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
  d.font.size = 11.5
  d.color = '#8e8e93'
  d.animation.duration = 900
  d.animation.easing = 'easeOutQuart'

  d.elements.bar.borderRadius = 7
  // Round only the value end of each bar (Apple-style), so a small bar
  // stays a bar instead of collapsing into a pill.
  d.elements.bar.borderSkipped = 'start'
  d.elements.bar.borderWidth = 0
  d.elements.arc.borderRadius = 6
  d.elements.arc.borderWidth = 0
  d.elements.line.tension = 0.4
  d.elements.line.borderWidth = 2.5
  d.elements.point.radius = 0
  d.elements.point.hoverRadius = 6
  d.elements.point.hitRadius = 14

  d.datasets.bar.maxBarThickness = 28
  d.datasets.bar.categoryPercentage = 0.7
  d.datasets.doughnut.cutout = '70%'
  d.datasets.doughnut.spacing = 3

  d.scale.grid.color = 'rgba(142,142,147,.14)'
  d.scale.grid.drawTicks = false
  d.scale.border.display = false
  d.scale.ticks.padding = 8

  const legend = d.plugins.legend
  legend.labels.usePointStyle = true
  legend.labels.pointStyle = 'circle'
  legend.labels.boxWidth = 8
  legend.labels.boxHeight = 8
  legend.labels.padding = 16

  const tip = d.plugins.tooltip
  tip.backgroundColor = 'rgba(28,28,30,.92)'
  tip.titleColor = '#fff'
  tip.bodyColor = 'rgba(255,255,255,.85)'
  tip.padding = 12
  tip.cornerRadius = 12
  tip.caretSize = 0
  tip.displayColors = true
  tip.boxPadding = 5
  tip.usePointStyle = true
  tip.titleFont = { weight: '600', size: 12.5 }
  tip.bodyFont = { size: 12 }
}
