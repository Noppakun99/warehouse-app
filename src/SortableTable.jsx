// SortableTable — เครื่องมือ sort ตารางกลาง (client-side) สำหรับ sub-app ที่โหลด data ครบใน memory
// ใช้กับตารางประวัติ/รายการที่ไม่ paginate เท่านั้น — ตาราง paginate (DispenseLog/ReceiveLog)
// ต้อง sort ฝั่ง server แยก ไม่งั้นเรียงได้แค่หน้าที่เห็น (ผิดความคาดหวัง)
import { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// useSort(rows, options) → { sorted, sort, toggleSort }
//   options.key   = คอลัมน์เริ่มต้น (null = ไม่เรียง, คงลำดับเดิม)
//   options.dir   = 'asc' | 'desc' (default 'asc')
//   options.numericKeys = Set/array ของ key ที่เรียงแบบตัวเลข (ที่เหลือเรียงแบบข้อความ th)
//   options.accessor = (row, key) => value  — ดึงค่าที่ใช้เทียบ (default row[key])
// eslint-disable-next-line react-refresh/only-export-components -- utility file: hook + th ร่วมกันโดยเจตนา
export function useSort(rows, { key = null, dir = 'asc', numericKeys = [], accessor } = {}) {
  const [sort, setSort] = useState({ key, dir });
  const numSet = useMemo(() => new Set(numericKeys), [numericKeys]);

  const toggleSort = useCallback((k) => {
    setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' });
  }, []);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    const numeric = numSet.has(sort.key);
    const get = accessor || ((row, k) => row[k]);
    // copy ก่อน sort (ไม่ mutate array เดิม) — เสถียร: ค่าเท่ากันคงลำดับเดิม
    return [...rows].sort((a, b) => {
      const va = get(a, sort.key), vb = get(b, sort.key);
      if (numeric) return ((Number(va) || 0) - (Number(vb) || 0)) * factor;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'th') * factor;
    });
  }, [rows, sort, numSet, accessor]);

  return { sorted, sort, toggleSort };
}

// <SortableTh> — หัวคอลัมน์ที่คลิกเรียงได้ + ไอคอนบอกทิศ
//   sortKey  = key ของคอลัมน์ (ต้องตรงกับที่ใช้ใน useSort/accessor)
//   sort, onSort = จาก useSort
//   align    = 'left' | 'right' | 'center' (default 'left')
//   className = คลาสของ <th> (คุมสีธีมต่อ sub-app — เช่น 'bg-slate-50 dark:bg-slate-800')
//   activeColor = คลาสสีไอคอนตอน active (default 'text-indigo-500')
export function SortableTh({ sortKey, label, sort, onSort, align = 'left', className = '', activeColor = 'text-indigo-500', children }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : (sort.dir === 'asc' ? ChevronUp : ChevronDown);
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const flexAlign = align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : '';
  return (
    <th className={`${alignClass} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title="คลิกเพื่อเรียงลำดับ"
        className={`inline-flex items-center gap-1 hover:opacity-70 transition-opacity ${flexAlign}`}
      >
        <span>{children ?? label}</span>
        <Icon size={13} className={active ? activeColor : 'opacity-40'} />
      </button>
    </th>
  );
}
