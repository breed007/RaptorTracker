import React from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { useApp } from '../context/AppContext'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function SpendChart({ data }) {
  const { darkMode } = useApp()

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-raptor-muted text-sm">
        No spend data yet — install some mods with costs
      </div>
    )
  }

  const barColor      = darkMode ? '#FF6B00' : '#003478'
  const hoverBar      = darkMode ? '#CC5500' : '#0562D2'
  const tooltipBg     = darkMode ? '#1A1A1A' : '#FFFFFF'
  const tooltipBorder = darkMode ? '#333333' : '#E0E0E0'
  const gridColor     = darkMode ? '#2A2A2A' : '#E8E8E8'
  const tickColor     = darkMode ? '#666666' : '#888888'
  const labelColor    = darkMode ? '#CCCCCC' : '#555555'
  const axisColor     = darkMode ? '#333333' : '#E0E0E0'

  const sorted = [...data].sort((a, b) => b.spend - a.spend)

  const chartData = {
    labels: sorted.map(d => d.category.replace('_', ' ')),
    datasets: [{
      data: sorted.map(d => d.spend),
      backgroundColor: barColor,
      hoverBackgroundColor: hoverBar,
      borderRadius: 4,
      borderSkipped: false,
    }]
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` $${ctx.parsed.x.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        titleColor: darkMode ? '#fff' : '#0A0A0A',
        bodyColor: darkMode ? '#ccc' : '#555',
      }
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: {
          color: tickColor,
          callback: v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`
        },
        border: { color: axisColor }
      },
      y: {
        grid: { display: false },
        ticks: { color: labelColor, font: { size: 11 } },
        border: { color: axisColor }
      }
    }
  }

  return (
    <div style={{ height: Math.max(data.length * 36, 120) }}>
      <Bar data={chartData} options={options} />
    </div>
  )
}
