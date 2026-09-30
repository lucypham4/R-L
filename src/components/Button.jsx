import { forwardRef } from 'react';
import './Button.css';

const Button = forwardRef(function Button({ variant = 'primary', className = '', ...props }, ref) {
  return <button ref={ref} className={`btn btn-${variant} ${className}`} {...props} />;
});

export default Button;
