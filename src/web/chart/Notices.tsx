/** Decode notices and warnings of a Drive Log, one `--warn` Notice each. The strings are shown as text only. */
export function Notices(props: { messages: readonly string[] }) {
  if (props.messages.length === 0) return null;
  return (
    <div class="notices">
      {props.messages.map((message, i) => (
        <p key={i} class="notice">
          <span class="notice-icon" aria-hidden="true">
            ⚠
          </span>
          <span>{message}</span>
        </p>
      ))}
    </div>
  );
}
