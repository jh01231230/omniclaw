package ai.omniclaw.android.ui

import androidx.compose.runtime.Composable
import ai.omniclaw.android.MainViewModel
import ai.omniclaw.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
