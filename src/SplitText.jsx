import React from 'react';

function SplitText({
  text,
  className = '',
  tag = 'p',
  delay = 45,
  textAlign = 'center',
}) {
  const Tag = tag;
  const chars = Array.from(text);

  return (
    <Tag className={`split-parent ${className}`} style={{ textAlign }}>
      {chars.map((char, index) => (
        <span
          // The text is static and intentionally split by visual order.
          key={`${char}-${index}`}
          className="split-char"
          style={{ '--split-delay': `${index * delay}ms` }}
        >
          {char === ' ' ? '\u00a0' : char}
        </span>
      ))}
    </Tag>
  );
}

export default SplitText;
