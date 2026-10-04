import { useId } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function AnalyticsSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const id = useId()
  return <div className="admin-filter"><label id={id}>{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-labelledby={id} className="h-10 w-auto min-w-36 gap-6 rounded-[10px] border-[#e8ebee] text-[13px] text-[#181a1d] shadow-none focus:border-[#00a8ef] focus:ring-2 focus:ring-[#00a8ef]/10 [&>svg]:shrink-0"><SelectValue /></SelectTrigger>
      <SelectContent className="rounded-[10px] border-[#e8ebee]" sideOffset={4}>{options.map(option => <SelectItem key={option.value} value={option.value} className="py-2 text-[13px] focus:bg-[#f0f9fe]">{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}
