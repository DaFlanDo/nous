import { Redirect } from 'expo-router';

// Экран входа показывается вместо любого адреса, поэтому после входа
// с /login или старой ссылки роутер искал несуществующую страницу.
// Всё неизвестное ведём на записи.
export default function NotFound() {
  return <Redirect href="/" />;
}
