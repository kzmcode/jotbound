import { copy } from './copy';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';

export function NotFoundScreen() {
  return (
    <EmptyState
      title={copy.notFound.title}
      action={
        <ButtonLink to="/" variant="secondary">
          {copy.notFound.back}
        </ButtonLink>
      }
    />
  );
}
