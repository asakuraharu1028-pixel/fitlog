import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MENU_GROUPS } from '../lib/menu'

/** 下部タブに入りきらない画面への入口 */
export default function Menu() {
  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-gray-800 px-1">メニュー</h1>

      {MENU_GROUPS.map(group => (
        <section key={group.title}>
          <h2 className="text-xs font-semibold text-gray-400 px-1 mb-2">{group.title}</h2>
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
            {group.items.map(({ to, icon: Icon, label, description, tone }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 hover:bg-gray-50 transition"
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                  <Icon size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-700">{label}</span>
                  <span className="block text-xs text-gray-400 truncate">{description}</span>
                </span>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
