import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { chartData } from '../data/demo'

export default function AdminChart() {
  return <>
    <div className="chart-legend"><span><i/>Appointments</span><b>1,284 <small>↗ 12.5%</small></b></div>
    <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:8,left:-22,bottom:0}}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4d92ed" stopOpacity={0.18}/><stop offset="98%" stopColor="#4d92ed" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eef1f5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#9aa4b3',fontSize:12}} dy={12}/><Tooltip contentStyle={{border:'1px solid #e7ebf1',borderRadius:10,fontSize:12}}/><Area type="monotone" dataKey="value" stroke="#4388e5" strokeWidth={2.5} fill="url(#chartFill)"/></AreaChart></ResponsiveContainer></div>
  </>
}
