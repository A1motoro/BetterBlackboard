import { useEffect, useRef } from 'react';
import { attachmentKey, collectAttachmentKeys } from '../core/download-plan';
import type { ContentNode } from '../core/types';

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function SelectionCheckbox({
  checked,
  indeterminate,
  disabled,
  label,
  onChange,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      className="h-4 w-4 shrink-0 accent-indigo-600"
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

interface ContentTreeProps {
  nodes: ContentNode[];
  selected: ReadonlySet<string>;
  onToggle: (keys: string[], selected: boolean) => void;
}

function NodeRow({
  node,
  selected,
  onToggle,
}: {
  node: ContentNode;
  selected: ReadonlySet<string>;
  onToggle: ContentTreeProps['onToggle'];
}) {
  const keys = collectAttachmentKeys([node]);
  const selectedCount = keys.filter((key) => selected.has(key)).length;
  const checked = keys.length > 0 && selectedCount === keys.length;
  const indeterminate = selectedCount > 0 && !checked;

  return (
    <li className="space-y-1">
      <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
        <SelectionCheckbox
          checked={checked}
          indeterminate={indeterminate}
          disabled={keys.length === 0}
          label={`选择 ${node.title}`}
          onChange={(value) => onToggle(keys, value)}
        />
        <span className="mt-px text-sm">{node.hasChildren ? '▾' : '•'}</span>
        <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-800">
          {node.title}
          {node.unsupported && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
              暂不支持
            </span>
          )}
        </span>
      </div>

      {node.attachments.map((attachment) => {
        const key = attachmentKey(attachment);
        return (
          <label
            key={key}
            className="ml-8 flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-indigo-50"
          >
            <SelectionCheckbox
              checked={selected.has(key)}
              indeterminate={false}
              label={`选择文件 ${attachment.fileName}`}
              onChange={(value) => onToggle([key], value)}
            />
            <span className="text-sm">↳</span>
            <span className="min-w-0 break-words text-sm text-slate-600">
              {attachment.fileName}
            </span>
          </label>
        );
      })}

      {node.children.length > 0 && (
        <ul className="ml-4 border-l border-slate-200 pl-2">
          {node.children.map((child) => (
            <NodeRow
              key={child.pk1}
              node={child}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ContentTree({ nodes, selected, onToggle }: ContentTreeProps) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <NodeRow
          key={node.pk1}
          node={node}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}
