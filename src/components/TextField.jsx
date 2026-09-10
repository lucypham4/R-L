import './TextField.css';

let idCounter = 0;

export function useFieldId(explicit) {
  if (explicit) return explicit;
  idCounter += 1;
  return `field-${idCounter}`;
}

export function Label({ htmlFor, required, optional, children }) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      {children}
      {required && (
        <span className="field-required" aria-hidden="true">
          *
        </span>
      )}
      {optional && <span className="field-optional">optional</span>}
      {required && <span className="visually-hidden"> required</span>}
    </label>
  );
}

export function TextInput({ id, error, className = '', ...props }) {
  return <input id={id} className={`field-input ${error ? 'field-input-error' : ''} ${className}`} {...props} />;
}

export function TextArea({ id, error, className = '', ...props }) {
  return (
    <textarea id={id} className={`field-input field-textarea ${error ? 'field-input-error' : ''} ${className}`} {...props} />
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p className="field-error">
      <span aria-hidden="true">! </span>
      {children}
    </p>
  );
}

export function HelpText({ children }) {
  if (!children) return null;
  return <p className="field-help">{children}</p>;
}
